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

    val connections = HashMap<WebSocket, ConnectionInfo>()
    val connectionsInv = HashMap<String, HashSet<WebSocket>>()
    val games = HashMap<String, Game>()

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

        val connectionInfo = connections[conn] ?: return
        connections.remove(conn)
        connectionsInv[connectionInfo.game.id]?.remove(conn)

        if (connectionInfo.game.phase == GamePhase.PREPARE) {
            // we can't just remove players during the game phase, it might be their word that's chosen and votes are
            // already cast. Therefore set them inactive, when they log in later with the same id they will be retrieved
            connectionInfo.game.clients.remove(connectionInfo.client)
        }

        sendUpdate(connectionInfo.game)
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
                    connections[conn]?.let { connectionInfo ->
                        (connectionInfo.client as? Player)?.name = message.getString("name")
                        sendUpdate(connectionInfo.game)
                    }
                }
                "setWord" -> {
                    connections[conn]?.let { connectionInfo ->
                        (connectionInfo.client as? Faker)?.word = message.getString("word")
                    }
                }
                "startRound" -> {
                    connections[conn]?.let { connectionInfo ->
                        if (connectionInfo.client !is Player) {
                            sendWarning("Als Zuschauer kannst du die Runde nicht starten.", conn)
                            return
                        }

                        val game = connectionInfo.game
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
                            Thread {
                                try {
                                    retrieveWikipediaContent(game, "de")?.let { game.wikipedia.add(it) }
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }

                                try {
                                    retrieveWikipediaContent(game, "en")?.let { game.wikipedia.add(it) }
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }
                            }.start()
                        }
                    }
                }
                "finishVoting" -> {
                    connections[conn]?.let { connectionInfo ->
                        if (connectionInfo.client !is Player) {
                            sendWarning("Als Zuschauer kannst du die Runde nicht beenden.", conn)
                            return
                        }

                        val game = connectionInfo.game
                        if (game.phase == GamePhase.GUESSING) {
                            game.phase = GamePhase.REVELATION
                            sendUpdate(game)
                        }
                    }
                }
                "vote" -> {
                    connections[conn]?.let { connectionInfo ->
                        val game = connectionInfo.game
                        (connectionInfo.client as? Player)?.let { guesser ->
                            guesser.vote = game.fakers.find { it.voteId == message.getString("vote") }
                            if (game.players.filter { it != game.chosenFaker }.all { it.vote != null }) {
                                game.phase = GamePhase.REVELATION
                            }
                            sendUpdate(game)
                        }
                    }
                }
                "restart" -> {
                    connections[conn]?.let { connectionInfo ->
                        val game = connectionInfo.game
                        game.phase = GamePhase.PREPARE
                        val websockets = connectionsInv[game.id]
                        game.clients = ArrayList(websockets?.mapNotNull { connections[it]?.client } ?: listOf())
                        game.chosenFaker = null
                        game.wikipedia.clear()
                        game.players.forEach {
                            it.vote = null
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

    private fun retrieveWikipediaContent(game: Game, language: String): WikipediaRef? {
        val url = UrlUtil.loadUrl(
            "https://${language}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles="
                    + UrlUtil.encodeURIComponent(game.chosenFaker?.word) + "&redirects"
        )
        val json = JSONObject(url)
        val pages = json.getJSONObject("query").getJSONObject("pages")
        val key = pages.keys().takeIf { it.hasNext() }?.next()
        if (key != null) {
            val page = pages.getJSONObject(key)
            if (page.has("missing")) return null;
            if (page.has("extract")) {
                val link =
                    "https://${language}.wikipedia.org/wiki/${UrlUtil.encodeURIComponent(page.getString("title"))}"
                var extract = page.getString("extract")
                if (extract.length > 750) {
                    extract = extract.substring(0, 750) + "…"
                }
                return WikipediaRef(link, extract)
            }
        }
        return null;
    }

    private fun join(message: JSONObject, conn: WebSocket, role: KClass<out GameSubscriber>) {
        val gameId = message.getString("game")
        val id = message.getOptionalString("id")
        val name = message.getOptionalString("name")
        val word = message.getOptionalString("word")

        val connectionInfo = connections[conn]
        if (connectionInfo != null) {
            val game = connectionInfo.game

            val newClient = when (role) {
                Faker::class -> connectionInfo.client.toFaker()
                Guesser::class -> connectionInfo.client.toGuesser()
                else -> connectionInfo.client
            }

            name?.let { (newClient as? Player)?.name = name }
            word?.let { (newClient as? Faker)?.word = word }

            game.clients[game.clients.indexOf(connectionInfo.client)] = newClient
            connections[conn] = ConnectionInfo(game, newClient)
            sendUserState(conn, gameId, newClient)
            if (role == Spectator::class) sendUpdate(game, conn) else sendUpdate(game)
            return
        }

        val game = games.getOrPut(gameId) { Game(gameId) }

        if (!id.isNullOrEmpty()) {
            val player = game.players.find { it.id == id }
            if (player != null) {
                connections[conn] = ConnectionInfo(game, player)
                connectionsInv.getOrPut(gameId) { HashSet() }.add(conn)
                sendUserState(conn, gameId, player)
                sendUpdate(game, conn)
                return
            }
        }

        val player = if (game.phase == GamePhase.GUESSING) {
            if (role != Spectator::class) {
                sendWarning(
                    "Das Spiel läuft bereits. Du bist jetzt Zuschauer, kannst aber nächste Runde einsteigen",
                    conn
                )
            }
            Spectator()
        } else when (role) {
            Faker::class -> Faker(name ?: "")
            Guesser::class -> Guesser(name ?: "")
            else -> Spectator()
        }

        name?.let { (player as? Player)?.name = name }
        word?.let { (player as? Faker)?.word = word }

        game.clients.add(player)
        connections[conn] = ConnectionInfo(game, player)
        connectionsInv.getOrPut(gameId) { HashSet() }.add(conn)
        sendUpdate(game)
        sendUserState(conn, gameId, player)
    }

    private fun sendUserState(conn: WebSocket, gameId: String, user: GameSubscriber) {
        user.json?.let {
            it.put("action", "userState")
            it.put("game", gameId)
            // println("[OUTGOING] $it")
            conn.send(it.toString())
        }
    }

    private fun sendWarning(message: String, game: Game) {
        val warning = JSONObject()
        warning.put("action", "warning")
        warning.put("message", message)
        broadcast(warning.toString(), connectionsInv[game.id])
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
                connectionsInv[game.id]?.filter { it.isOpen }?.forEach { websocket ->
                    val player = connections[websocket]?.client as? Player
                    json.put("vote", player?.vote?.voteId)
                    json.put("ownWord", game.chosenFaker == player)
                    json.put("canVote", player != null)
                    // println("[OUTGOING] $json")
                    websocket.send(json.toString())
                }
            } else {
                // println("[OUTGOING] ${game.stateJson}")
                broadcast(game.stateJson.toString(), connectionsInv[game.id]?.filter { it.isOpen })
            }
        } else {
            val json = game.stateJson
            val player = connections[conn]?.client as? Player
            json.put("vote", player?.vote?.voteId)
            json.put("ownWord", game.chosenFaker == player)
            // println("[OUTGOING] $json")
            conn.send(json.toString())
        }
    }

    override fun onStart() {
        println("Server started!")
        connectionLostTimeout = 10
    }
}

class ConnectionInfo(val game: Game, val client: GameSubscriber)