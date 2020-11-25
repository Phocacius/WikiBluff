var a;
$(document).ready(function () {
    if (!("WebSocket" in window)) {
        $('<p>Oh no, you need a browser that supports WebSockets. How about <a href="https://www.mozilla.org/de/firefox/new/">Firefox</a>?</p>').appendTo('#container');
        return;
    }


    //The user has WebSockets, yaaaay
    var socket;
    var host = "ws://" + serverUrl + ":" + serverPort;
    var reconnect = true;


    function wsconnect() {
        try {
            socket = new WebSocket(host);
            socket.onopen = function () {
                status('<p class="event">Socket Status: ' + socket.readyState + ' (open)');

                var name = localStorage.getItem("name");
                if (name) {
                    $(".name").val(name);
                    sendName(name);
                }

                var word = localStorage.getItem("word");
                if (word) {
                    $(".word").val(word);
                    sendWord(word);
                }

            };

            socket.onerror = function (error) {
                status('<p class="event">Socket Status: ' + socket.readyState + ' (' + error + ')');
            };

            //receive message
            socket.onmessage = function (msg) {
                var data = JSON.parse(msg.data);
                status(data);

                switch (data.action) {
                    case "userList":
                        var html = "";
                        var gamemasterSet = false;
                        var everyoneReady = true;

                        Object.entries(data.users).forEach(function (entry) {
                            var [key, value] = entry;
                            html += '<label><input type="radio" class="gamemaster" data-id="' + key + '"';
                            if (value.master) {
                                html += " checked";
                                gamemasterSet = true;
                            }
                            html += ' /> ';
                            if(!value.master && !value.ready) {
                                everyoneReady = false;
                            } else {
                                html += "<strong>";
                            }
                            html += value.name;
                            if(value.master || value.ready) html += "</strong>";
                            if(value.ready) html += " (Bereit)";
                            html += '</label>';
                        });
                        $(".userlist").html(html);
                        if(!gamemasterSet) {
                            $(".messages").text("Noch keine ratende Person ausgewählt!");
                            $(".lets-go").hide();
                        } else if(!everyoneReady) {
                            $(".messages").text("Es sind noch nicht alle bereit!");
                            $(".lets-go").hide();
                        } else {
                            $(".messages").text("");
                            $(".lets-go").show();
                        }

                        break;
                    case "gamemaster":
                        if(data.gamemaster) {
                            $(".ratender").show();
                            $(".nicht-ratender").hide();
                            $(".word").attr("disabled", "disabled");
                        } else {
                            $(".ratender").hide();
                            $(".nicht-ratender").show();
                            $(".word").removeAttr("disabled");
                        }
                        break;
                    case "startRound":
                        $(".messages").text("");
                        $(".lets-go").hide();
                        $(".the-word-wrapper").show();
                        setTimeout(function() {
                             $(".the-word").text(data.word).fadeIn();
                             $(".restart").delay(1000).show();
                        }, 500);
                        break;
                    case "restart":
                        $(".the-word-wrapper").hide();
                        $(".restart").hide();
                        $(".the-word").hide();
                        $(".unready").hide();
                        $(".ready").show();
                        $(".ratender").hide();
                        $(".nicht-ratender").show();
                        $(".word").removeAttr("disabled");
                }
            };

            socket.onclose = function (e) {
                if (reconnect) {
                    wsconnect();
                }
                status('<p class="event">Socket Status: ' + socket.readyState + ' (Closed)');
            }

        } catch
            (exception) {
            message('<p>Error' + exception);
        }
    }


    function send(text) {
        try {
            socket.send(text);
            status('<p class="event">' + name + ': ' + text)
        } catch (exception) {
            status('<p class="warning">');
        }
    }


    function status(msg) {
        console.log(msg);
    }


    var sendName = function (name) {
        var cmd = {
            "action": "setName",
            "name": name
        };
        socket.send(JSON.stringify(cmd));
    };

    var sendWord = function (word) {
        var cmd = {
            "action": "setWord",
            "word": word
        };
        socket.send(JSON.stringify(cmd));
    };


    $(document).on("blur", ".name", function (e) {
        var name = $(e.target).val();
        localStorage.setItem("name", name);
        sendName(name);
    });

    $(document).on("blur", ".word", function (e) {
        var word = $(e.target).val();
        localStorage.setItem("word", word);
        sendWord(word);
    });

    $(document).on("click", ".ready", function (e) {
        var cmd = {
            "action": "setReady",
            "ready": true
        };
        $(".ready").hide();
        $(".unready").show();
        socket.send(JSON.stringify(cmd));
    });

    $(document).on("click", ".unready", function (e) {
        var cmd = {
            "action": "setReady",
            "ready": false
        };
        $(".ready").show();
        $(".unready").hide();
        socket.send(JSON.stringify(cmd));
    });

    $(document).on("click", ".gamemaster", function (e) {
        var id = $(e.target).attr("data-id");
        var cmd = {
            "action": "setGamemaster",
            "id": id
        };
        socket.send(JSON.stringify(cmd));
    });

    $(document).on("click", ".lets-go", function (e) {
        var cmd = {
            "action": "startRound"
        };
        socket.send(JSON.stringify(cmd));
    });

    $(document).on("click", ".restart", function (e) {
        var cmd = {
            "action": "restart"
        };
        socket.send(JSON.stringify(cmd));
    });


    wsconnect();
//End connect()

})
;