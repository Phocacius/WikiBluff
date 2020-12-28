$ = jQuery = require('jquery');
var Twig = require('twig');
var templatePrepare = require("./templates/prepare")
var templateGuessersFakers = require("./templates/guessers-fakers")

$(document).ready(function () {
    if (!("WebSocket" in window)) {
        $('<p>Oh no, you need a browser that supports WebSockets. How about <a href="https://www.mozilla.org/de/firefox/new/">Firefox</a>?</p>').appendTo('#container');
        return;
    }

    //The user has WebSockets, yaaaay
    var socket;
    var host = "ws://" + serverUrl + ":" + serverPort;
    var reconnect = true;

    var gameJson = {}
    var userState = {}

    function wsconnect() {
        try {
            socket = new WebSocket(host);
            socket.onopen = function () {
                status('[Socket Status]: ' + socket.readyState + ' (open)');
                requestStatus();
            };

            socket.onerror = function (error) {
                status('[Socket Status]: ' + socket.readyState + ' (' + error + ')');
            };

            //receive message
            socket.onmessage = function (msg) {
                var data = JSON.parse(msg.data);
                status("[Incoming]: " + msg.data);

                switch (data.action) {
                    case "join":

                    // no break, status is also included
                    case "update":
                        data.address = $("body").attr("data-address")
                        var gameIsInPhase1 = data.state === 'initial' || data.state === "ready_to_play";
                        var gameWasInPhase1 = gameJson.state === 'initial' || gameJson.state === "ready_to_play";

                        if (gameIsInPhase1 && !gameWasInPhase1) {
                            $("#container").html(templatePrepare.render(data));
                        } else if (gameIsInPhase1 && gameWasInPhase1) {
                            $("#guesser-faker-container").html(templateGuessersFakers.render(data));
                        }
                        gameJson = data;
                        break;

                }
            };

            socket.onclose = function (e) {
                if (reconnect) {
                    wsconnect();
                }
                status('[Socket Status]: ' + socket.readyState + ' (Closed)');
            }

        } catch
            (exception) {
            message('<p>Error' + exception);
        }
    }

    function send(text) {
        try {
            if (typeof (text) === 'object') text = JSON.stringify(text)
            socket.send(text);
            status('[Outgoing]: ' + text)
        } catch (exception) {
            status('[Error]: ', exception);
        }
    }


    function status(msg, err) {
        if (err) console.log(msg, err); else console.log(msg);
    }

    var requestStatus = function () {
        send({
            "action": "status",
            "game": $("body").attr("data-game")
        });
    }

    var sendName = function (name) {
        if (!userState.state) return
        send({
            "action": "setName",
            "name": name
        });
    };

    var sendWord = function (word) {
        if (!userState.state) return
        send({
            "action": "setWord",
            "word": word
        });
    };


    $(document).on("blur", ".js-name", function (e) {
        var name = $(e.target).val();
        localStorage.setItem("name", name);
        sendName(name);
    });

    $(document).on("blur", ".js-word", function (e) {
        var word = $(e.target).val();
        localStorage.setItem("word", word);
        sendWord(word);
    });

    $(document).on("click", ".js-join-fakers", function (e) {
        send({
            "action": "joinFakers",
            "game": $("body").attr("data-game"),
            "name": $(".js-name").val(),
            "word": $(".js-word").val()
        });
    });

    $(document).on("click", ".js-join-guessers", function (e) {
        send({
            "action": "joinGuessers",
            "game": $("body").attr("data-game"),
            "name": $(".js-name").val()
        });
    });

    wsconnect();
//End connect()

});
