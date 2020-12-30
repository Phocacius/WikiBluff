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

        val removedPlayer = game.clients.remove(conn) as? Player
        if (removedPlayer != null && game.phase != GamePhase.PREPARE) {
            // we can't just remove players during the game phase, it might be their word that's chosen and votes are
            // already cast. Therefore set them inactive, when they log in later with the same id they will be retrieved
            game.inactivePlayers.add(removedPlayer)
        }
        connections.remove(conn)

        sendUpdate(game)
    }

    override fun onMessage(conn: WebSocket, msg: ByteBuffer) {
        onMessage(conn, msg.array().toString(Charset.forName("UTF-8")))
    }

    override fun onMessage(conn: WebSocket, msg: String) {
        println("[INCOMING] $msg")
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
                "startRound" -> {
                    connections[conn]?.let { game ->
                        if (game.fakers.size < 2) {
                            sendWarning("Es müssen mindestens zwei Faker mitspielen!", conn)
                        } else if (game.phase != GamePhase.PREPARE) {
                            sendWarning("Spiel bereits gestartet!", conn)
                        } else {
                            val fakersWithWords = game.fakers.filter { !it.word.isNullOrBlank() }
                            if (fakersWithWords.isEmpty()) {
                                sendWarning("Kein Faker hat ein Wort gewählt.", game)
                                sendUpdate(game)
                                return@let
                            }

                            game.chosenFaker = fakersWithWords.random()
                            game.phase = GamePhase.GUESSING
                            sendUpdate(game)
                            retrieveWikipediaContent(game)
                        }
                    }
                }
                "finishVoting" -> {
                    connections[conn]?.let { game ->
                        if (game.phase == GamePhase.GUESSING) {
                            game.phase = GamePhase.REVELATION
                            sendUpdate(game)
                        }
                    }
                }
                "vote" -> {
                    connections[conn]?.let { game ->
                        (game.clients[conn] as? Player)?.let { guesser ->
                            guesser.vote = game.fakers.find { it.voteId == message.getString("vote") }
                            if (game.players.filter { it != game.chosenFaker }.all { it.vote != null }) {
                                game.phase = GamePhase.REVELATION
                            }
                            sendUpdate(game)
                        }
                    }
                }
                "restart" -> {
                    connections[conn]?.let { game ->
                        game.phase = GamePhase.PREPARE
                        game.chosenFaker = null
                        game.wikipediaLink = null
                        game.wikipediaText = null
                        game.inactivePlayers.clear()
                        game.clients.values.forEach {
                            (it as? Player)?.vote = null
                        }
                        sendUpdate(game)
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            sendWarning(e.localizedMessage, conn)
        }
    }

    private fun retrieveWikipediaContent(game: Game) {
        return
        // TODO
        val url = UrlUtil.loadUrl(
            "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles="
                    + UrlUtil.encodeURIComponent(game.chosenFaker?.word)
        )
        val json = JSONObject(url)


    }

    private fun join(message: JSONObject, conn: WebSocket, role: KClass<out GameSubscriber>) {
        val gameId = message.getString("game")
        val id = message.getOptionalString("id")
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
                    sendUserState(conn, gameId, value)
                }
                if (role == Spectator::class) sendUpdate(game, conn) else sendUpdate(game)
                return
            } else {
                val removed = game.clients.remove(conn)
                if (!(removed is Spectator)) sendUpdate(game)
            }
        }

        val game = games.getOrPut(gameId) { Game() }

        if (!id.isNullOrEmpty()) {
            game.inactivePlayers.find { it.id == id }?.let { player ->
                game.inactivePlayers.remove(player)
                game.clients.put(conn, player)
                sendUpdate(game)
                sendUserState(conn, gameId, player)
                return
            }
        }

        val player = when (role) {
            Faker::class -> Faker(name ?: "")
            Guesser::class -> Guesser(name ?: "")
            else -> Spectator()
        }
        game.clients.put(conn, player)
        connections.put(conn, game)
        sendUpdate(game)
        sendUserState(conn, gameId, player)
    }

    private fun sendUserState(conn: WebSocket, gameId: String, user: GameSubscriber) {
        user.json?.let {
            it.put("action", "userState")
            it.put("game", gameId)
            println("[OUTGOING] $it")
            conn.send(it.toString())
        }
    }

    private fun sendWarning(message: String, game: Game) {
        val warning = JSONObject()
        warning.put("action", "warning")
        warning.put("message", message)
        broadcast(warning.toString(), game.clients.keys)
    }

    private fun sendWarning(message: String?, conn: WebSocket) {
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
            if (game.phase == GamePhase.GUESSING) {
                val json = game.stateJson
                game.clients.filter { it.key.isOpen }.forEach {
                    val player = it.value as? Player
                    json.put("vote", player?.vote?.voteId)
                    json.put("ownWord", game.chosenFaker == player)
                    it.key.send(json.toString())
                }

            } else {
                broadcast(game.stateJson.toString(), game.clients.keys.filter { it.isOpen })
            }
        } else {
            conn.send(game.stateJson.toString())
        }
    }

    override fun onStart() {
        println("Server started!")
        connectionLostTimeout = 10
    }
}

class ConnectionInfo(val game: Game, val player: GameSubscriber)