$ = jQuery = require('jquery');
var Twig = require('twig');
var templatePrepare = require("./templates/prepare")
var templateRoundRunning = require("./templates/round-running")
var templateGuessersFakers = require("./templates/guessers-fakers")
var templateRevelation = require("./templates/revelation")
var infoMessageManager = require("./InfoMessageManager")

$(document).ready(function () {
    if (!("WebSocket" in window)) {
        $('<p>Oh no, you need a browser that supports WebSockets. How about <a href="https://www.mozilla.org/de/firefox/new/">Firefox</a>?</p>').appendTo('#container');
        return;
    }

    //The user has WebSockets, yaaaay
    var socket;
    var host = "ws://" + serverUrl + ":" + serverPort;
    var reconnect = true;

    var gameId = $("body").attr("data-game");
    var gameJson = {}
    var userState = localStorage.getItem("userState");
    userState = userState ? JSON.parse(userState) : {};

    function wsconnect() {
        try {
            socket = new WebSocket(host);
            socket.onopen = function () {
                status('[Socket Status]: ' + socket.readyState + ' (open)');

                if (userState[gameId] && userState[gameId].role) {
                    var userStateCopy = JSON.parse(JSON.stringify(userState[gameId]));

                    if (userState[gameId].role === "faker") {
                        userStateCopy.action = "joinFakers";
                    }

                    if (userState[gameId].role === "guesser") {
                        userStateCopy.action = "joinGuessers";
                    }
                    send(userStateCopy);
                } else {
                    requestStatus();
                }
            };

            socket.onerror = function (error) {
                status('[Socket Status]: ' + socket.readyState + ' (' + error + ')');
            };

            //receive message
            socket.onmessage = function (msg) {
                var data = JSON.parse(msg.data);
                status("[Incoming]: " + msg.data);

                switch (data.action) {
                    case "warning":
                        infoMessageManager.showError(data.message);
                        break;

                    case "userState":
                        userState = localStorage.getItem("userState");
                        userState = userState ? JSON.parse(userState) : {};
                        data.word = $(".js-word").val();
                        userState[data.game] = data;
                        localStorage.setItem("userState", JSON.stringify(userState));
                        break;

                    case "update":
                        data.address = $("body").attr("data-address")
                        data.lang = window.lang;
                        var gameIsInPhase1 = data.state === 'prepare';
                        var gameWasInPhase1 = gameJson.state === 'prepare';

                        if (gameIsInPhase1 && !gameWasInPhase1) {
                            $("#container").html(templatePrepare.render(data));
                            if (userState[gameId]) {
                                $(".js-name").val(userState[gameId].name);
                                $(".js-word").val(userState[gameId].word);
                            }
                        } else if (gameIsInPhase1 && gameWasInPhase1) {
                            $("#guesser-faker-container").html(templateGuessersFakers.render(data));
                        } else if (data.state === 'guessing') {
                            $("#container").html(templateRoundRunning.render(data));
                        } else if (data.state === 'revelation') {
                            $("#container").html(templateRevelation.render(data));
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
            "game": gameId
        });
    }

    var sendName = function (name) {
        if (!userState[gameId] || !userState[gameId].role) return
        send({
            "action": "setName",
            "name": name
        });
        userState[gameId].name = name;
        localStorage.setItem("userState", JSON.stringify(userState));
    };

    var sendWord = function (word) {
        if (!userState[gameId] || !userState[gameId].role) return
        send({
            "action": "setWord",
            "word": word
        });
        userState[gameId].word = word;
        localStorage.setItem("userState", JSON.stringify(userState));
    };


    $(document).on("blur", ".js-name", function (e) {
        e.preventDefault();
        var name = $(e.target).val();
        localStorage.setItem("name", name);
        sendName(name);
    });

    $(document).on("blur", ".js-word", function (e) {
        e.preventDefault();
        var word = $(e.target).val();
        localStorage.setItem("word", word);
        sendWord(word);
    });

    $(document).on("click", ".js-join-fakers", function (e) {
        e.preventDefault();
        send({
            "action": "joinFakers",
            "game": $("body").attr("data-game"),
            "name": $(".js-name").val(),
            "word": $(".js-word").val()
        });
    });

    $(document).on("click", ".js-join-guessers", function (e) {
        e.preventDefault();
        send({
            "action": "joinGuessers",
            "game": $("body").attr("data-game"),
            "name": $(".js-name").val()
        });
    });

    $(document).on("click", ".js-start-round", function (e) {
        e.preventDefault();
        send({
            "action": "startRound"
        });
    });

    $(document).on("click", ".js-finish-voting", function (e) {
        e.preventDefault();
        send({
            "action": "finishVoting"
        });
    });

    $(document).on("click", ".js-restart", function (e) {
        e.preventDefault();
        send({
            "action": "restart"
        });
    });

    $(document).on("click", ".js-share", function (e) {
        var input = $(e.target);
        input.select();
        document.execCommand("copy");
        infoMessageManager.showSuccess("copiedToClipboard");
    });

    $(document).on("click", ".js-faker", function (e) {
        var $item = $(e.target);
        var vote = $item.attr("data-id");
        send({
            "action": "vote",
            "vote": vote
        });
    });

    wsconnect();
//End connect()

});
