package de.thorstenhack.wikibluff

import org.java_websocket.WebSocket
import java.util.*
import kotlin.collections.HashMap

class Game {
    val clients = HashMap<WebSocket, Player>()
    var phase = GamePhase.INITIAL
    var chosenFaker: Faker? = null

    val stateJson: String
        get() {
            return ""
        }

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

abstract class Player(
    var name: String,
    var id: String = UUID.randomUUID().toString()
) {
    var vote: Player? = null

    fun toFaker(): Player = when (this) {
        is Guesser -> Faker(name).apply {
            id = this@Player.id
            vote = this@Player.vote
        }
        else -> this
    }

    fun toGuesser(): Player = when (this) {
        is Faker -> Guesser(name).apply {
            id = this@Player.id
            vote = this@Player.vote
        }
        else -> this
    }
}

class Guesser(name: String) : Player(name)

class Faker(name: String) : Player(name) {
    var word: String? = null
    var isReady: Boolean = false
}
