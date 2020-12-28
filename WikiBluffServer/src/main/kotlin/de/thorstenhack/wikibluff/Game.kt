package de.thorstenhack.wikibluff

import org.java_websocket.WebSocket
import org.json.JSONArray
import org.json.JSONObject
import java.util.*
import kotlin.collections.HashMap

class Game {
    val clients = HashMap<WebSocket, GameSubscriber>()
    var phase = GamePhase.INITIAL
    var chosenFaker: Faker? = null

    val stateJson: String
        get() = JSONObject().apply {
            put("action", "update")
            put("state", phase.name.toLowerCase())
            put("word", chosenFaker?.word)
            put("voteCount", clients.values.mapNotNull { it as? Player }.count { it.vote != null })
            put("guessers", JSONArray(
                guessers.map {
                    JSONObject().apply {
                        put("name", it.name)
                    }
                }
            ))
            put("fakers", JSONArray(
                fakers.map {
                    JSONObject().apply {
                        put("name", it.name)
                        put("ready", it.isReady)
                    }
                }
            ))
        }.toString()

    val fakers: List<Faker> get() = clients.values.mapNotNull { it as? Faker }
    val guessers: List<Guesser> get() = clients.values.mapNotNull { it as? Guesser }
}

enum class GamePhase {
    INITIAL,
    READY_TO_PLAY,
    GUESSING,
    READY_TO_VOTE,
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
}

abstract class Player(
    var name: String,
    var id: String = UUID.randomUUID().toString()
): GameSubscriber() {
    var vote: Player? = null
}

class Spectator: GameSubscriber()

class Guesser(name: String) : Player(name)

class Faker(name: String) : Player(name) {
    var word: String? = null
    var isReady: Boolean = false
}
