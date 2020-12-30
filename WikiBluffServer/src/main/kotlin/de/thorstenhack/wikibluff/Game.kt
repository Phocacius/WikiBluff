package de.thorstenhack.wikibluff

import org.java_websocket.WebSocket
import org.json.JSONArray
import org.json.JSONObject
import java.util.*
import kotlin.collections.HashMap

class Game {
    val clients = HashMap<WebSocket, GameSubscriber>()
    val inactivePlayers = ArrayList<Player>()
    var phase = GamePhase.PREPARE
    var chosenFaker: Faker? = null
    var wikipediaLink: String? = null
    var wikipediaText: String? = null

    val stateJson: JSONObject
        get() = JSONObject().apply {
            put("action", "update")
            put("state", phase.name.toLowerCase())

            put("guessers", JSONArray(
                guessers.sortedBy { it.name }.map {
                    JSONObject().apply {
                        put("name", it.name)
                    }
                }
            ))
            put("fakers", JSONArray(
                fakers.sortedBy { it.name }.map { faker ->
                    JSONObject().apply {
                        put("name", faker.name)
                        if (phase == GamePhase.GUESSING) {
                            put("voteid", faker.voteId)
                        }

                        if (phase == GamePhase.REVELATION) {
                            put("wasChosen", chosenFaker == faker)
                            put("votedFor", players.asSequence().filter { it.vote == faker }.sortedBy { it.name }.map { it.name })
                        }
                    }
                }
            ))

            if (phase.ordinal >= GamePhase.GUESSING.ordinal) {
                put("word", chosenFaker?.word)
                put("votesRemaining", players.filter { it != chosenFaker }.count { it.vote == null })
            }
        }

    val fakers: List<Faker> get() = clients.values.union(inactivePlayers).mapNotNull { it as? Faker }
    val guessers: List<Guesser> get() = clients.values.union(inactivePlayers).mapNotNull { it as? Guesser }
    val players: List<Player> get() = clients.values.union(inactivePlayers).mapNotNull { it as? Player }
}

enum class GamePhase {
    PREPARE,
    GUESSING,
    REVELATION
}

abstract class GameSubscriber {

    fun toFaker(): Player = when (this) {
        is Guesser -> Faker(name).apply {
            id = this@GameSubscriber.id
            vote = this@GameSubscriber.vote
        }
        is Faker -> this
        else -> Faker("")
    }

    fun toGuesser(): Player = when (this) {
        is Faker -> Guesser(name).apply {
            id = this@GameSubscriber.id
            vote = this@GameSubscriber.vote
        }
        is Guesser -> this
        else -> Guesser("")
    }

    val json: JSONObject?
        get() {
            val player = (this as? Player) ?: return null

            return JSONObject().apply {
                put("role", if (player is Guesser) "guesser" else "faker")
                put("name", player.name)
                put("id", player.id)
                (player as? Faker)?.let {
                    put("word", it.word)
                }
            }
        }
}

abstract class Player(
    var name: String,
    var id: String = UUID.randomUUID().toString()
) : GameSubscriber() {
    var vote: Faker? = null
}

class Spectator : GameSubscriber()

class Guesser(name: String) : Player(name)

class Faker(name: String) : Player(name) {
    var word: String? = null
    var voteId: String = UUID.randomUUID().toString()
}
