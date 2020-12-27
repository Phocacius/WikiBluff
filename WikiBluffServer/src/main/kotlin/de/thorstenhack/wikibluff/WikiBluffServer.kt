package de.thorstenhack.wikibluff

import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONObject
import java.io.IOException
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.nio.charset.Charset


/**
 * A simple WebSocketServer implementation. Keeps track of a "chatroom".
 */
class ChatServer(port: Int) : WebSocketServer(InetSocketAddress(port)) {

    val games = HashMap<String, Game>()
    val connections = HashMap<WebSocket, Game>()

    companion object {
        @Throws(InterruptedException::class, IOException::class)
        @JvmStatic
        fun main(args: Array<String>) {
            val port = 1337
            val server = ChatServer(port)
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

        sendUpdate(game)
    }

    override fun onMessage(conn: WebSocket, message: String) {
        broadcast(message)
        println("$conn: $message")
    }

    override fun onMessage(conn: WebSocket, msg: ByteBuffer) {
        println("$conn: $msg")
        val message = JSONObject(msg.array().toString(Charset.forName("UTF-8")))
        when (message.getString("action")) {
            "joinFakers" -> join(message, conn, true)
            "joinGuessers" -> join(message, conn, false)

            "setName" -> {
                connections[conn]?.let { game ->
                    game.clients[conn]?.name = message.getString("name")
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
    }

    private fun join(message: JSONObject, conn: WebSocket, faker: Boolean) {
        val gameId = message.getString("gameId")
        //val id = message.getString("id")
        val name = message.getString("name")

        connections[conn]?.let { game ->
            if (games[gameId] == game) {
                game.clients[conn]?.let { client ->
                    client.name = name
                    val value = if(faker) client.toFaker() else client.toGuesser()
                    game.clients.put(conn, value)
                }
                sendUpdate(game)
                return
            } else {
                game.clients.remove(conn)
                sendUpdate(game)
            }
        }

        val player = if(faker) Faker(name) else Guesser(name)
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

    override fun onError(conn: WebSocket?, ex: Exception) {
        ex.printStackTrace()
        if (conn != null) {
            // some errors like port binding failed may not be assignable to a specific websocket
        }
    }

    private fun sendUpdate(game: Game) {
        broadcast(game.stateJson, game.clients.keys)
    }

    override fun onStart() {
        println("Server started!")
        connectionLostTimeout = 10
    }
}