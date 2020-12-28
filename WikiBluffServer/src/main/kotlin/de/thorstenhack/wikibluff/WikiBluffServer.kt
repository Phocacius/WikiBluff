package de.thorstenhack.wikibluff

import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONObject
import java.io.IOException
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.nio.charset.Charset
import kotlin.reflect.KClass


class WikiBluffServer(port: Int) : WebSocketServer(InetSocketAddress(port)) {

    init {
        isReuseAddr = true
    }

    val games = HashMap<String, Game>()
    val connections = HashMap<WebSocket, Game>()

    companion object {
        @Throws(InterruptedException::class, IOException::class)
        @JvmStatic
        fun main(args: Array<String>) {
            val port = 1337
            val server = WikiBluffServer(port)
            server.start()
            println("ChatServer started on port: " + server.port)
        }
    }

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
        println(conn.toString() + " at " + conn.remoteSocketAddress.address.hostAddress + " connected!")
    }

    override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
        println("$conn has left the room!")

        val game = connections[conn] ?: return
        game.clients.remove(conn)
        connections.remove(conn)

        sendUpdate(game)
    }

    override fun onMessage(conn: WebSocket, msg: ByteBuffer) {
        onMessage(conn, msg.array().toString(Charset.forName("UTF-8")))
    }

    override fun onMessage(conn: WebSocket, msg: String) {
        println("$conn: $msg")
        try {
            val message = JSONObject(msg)
            when (message.getString("action")) {
                "status" -> join(message, conn, Spectator::class)
                "joinFakers" -> join(message, conn, Faker::class)
                "joinGuessers" -> join(message, conn, Guesser::class)

                "setName" -> {
                    connections[conn]?.let { game ->
                        (game.clients[conn] as? Player)?.name = message.getString("name")
                        sendUpdate(game)
                    }
                }
                "setWord" -> {
                    connections[conn]?.let { game ->
                        (game.clients[conn] as? Faker)?.word = message.getString("word")
                    }
                }
                "setReady" -> {
                    connections[conn]?.let { game ->
                        val client = game.clients[conn] as? Faker ?: return@let
                        client.isReady = message.getBoolean("ready")
                        val readyToPlay = game.fakers.size >= 2 && game.fakers.all { it.isReady }
                        game.phase = if (readyToPlay) GamePhase.READY_TO_PLAY else GamePhase.INITIAL
                        sendUpdate(game)
                    }
                }
                "startRound" -> {
                    connections[conn]?.let { game ->
                        if (game.phase == GamePhase.READY_TO_PLAY) {
                            val words = game.fakers.mapNotNull { it.word }
                            if (words.isEmpty()) {
                                sendWarning("Kein Faker hat ein Wort gewählt.", game)
                                game.fakers.forEach { it.isReady = false }
                                sendUpdate(game)
                                return@let
                            }

                            game.chosenFaker = game.fakers.random()
                            game.phase = GamePhase.GUESSING
                            sendUpdate(game)
                        }
                    }
                }
                "startVoting" -> {
                    connections[conn]?.let { game ->
                        if (game.phase == GamePhase.GUESSING) {
                            game.phase = GamePhase.READY_TO_VOTE
                        }
                    }
                }
                "vote" -> {
                    connections[conn]?.let { game ->
                        (game.clients[conn] as? Guesser)?.let { guesser ->
                            guesser.vote = game.fakers.find { it.id == message.getString("vote") }
                            if (game.guessers.all { it.vote != null }) {
                                game.phase = GamePhase.REVELATION
                            }
                            sendUpdate(game)
                        }
                    }
                }
                "restart" -> {
                    connections[conn]?.let { game ->
                        game.phase = GamePhase.INITIAL
                        game.guessers.forEach {
                            it.vote = null
                        }
                        game.fakers.forEach {
                            it.vote = null
                            it.isReady = false
                        }
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            sendWarning(e.localizedMessage, conn)
        }
    }

    private fun join(message: JSONObject, conn: WebSocket, role: KClass<out GameSubscriber>) {
        val gameId = message.getString("game")
        //val id = message.getString("id")
        val name = message.getOptionalString("name")
        val word = message.getOptionalString("word")

        connections[conn]?.let { game ->
            if (games[gameId] == game) {
                game.clients[conn]?.let { client ->
                    val value = when (role) {
                        Faker::class -> client.toFaker()
                        Guesser::class -> client.toGuesser()
                        else -> client
                    }
                    name?.let { (value as? Player)?.name = name }
                    word?.let { (value as? Faker)?.word = word }

                    game.clients.put(conn, value)
                }
                if (role == Spectator::class) sendUpdate(game, conn) else sendUpdate(game)
                return
            } else {
                val removed = game.clients.remove(conn)
                if (!(removed is Spectator)) sendUpdate(game)
            }
        }

        val player = when (role) {
            Faker::class -> Faker(name ?: "")
            Guesser::class -> Guesser(name ?: "")
            else -> Spectator()
        }
        val game = games.getOrPut(gameId) { Game() }
        game.clients.put(conn, player)
        connections.put(conn, game)
        sendUpdate(game)
    }

    private fun sendWarning(message: String, game: Game) {
        val warning = JSONObject()
        warning.put("action", "warning")
        warning.put("message", message)
        broadcast(warning.toString(), game.clients.keys)
    }

    private fun sendWarning(message: String, conn: WebSocket) {
        val warning = JSONObject()
        warning.put("action", "warning")
        warning.put("message", message)
        conn.send(warning.toString())
    }

    override fun onError(conn: WebSocket?, ex: Exception) {
        ex.printStackTrace()
        if (conn != null) {
            // some errors like port binding failed may not be assignable to a specific websocket
        }
    }

    private fun sendUpdate(game: Game, conn: WebSocket? = null) {
        if (conn == null) {
            broadcast(game.stateJson, game.clients.keys)
        } else {
            conn.send(game.stateJson)
        }
    }

    override fun onStart() {
        println("Server started!")
        connectionLostTimeout = 10
    }
}