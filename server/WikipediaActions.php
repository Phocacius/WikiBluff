<?php

class WikipediaActions {

    /*** VARIABLEN ***/
    /**
     * @var socketWebSocket
     */
    private $socketClass;

    /**
     * @var array<array>
     */
    private $clients = [];


    /*** KONSTRUKTOR ***/
    function __construct($socketClass) {
        // Die Websocket-Klasse muss zwischengespeichert werden, um das Senden von Frames zu ermöglichen
        $this->socketClass = $socketClass;
    }


    /*** WEBSOCKET-FUNKTIONEN ***/

    public function setName($msg, $socket, $socketId) {

        if (array_key_exists($socketId, $this->clients)) {
            $this->clients[$socketId]["name"] = $msg['name'];
        } else {
            $this->clients[$socketId] = ["name" => $msg['name']];
        }

        $this->sendNames();
    }

    public function setWord($msg, $socket, $socketId) {

        if (array_key_exists($socketId, $this->clients)) {
            $this->clients[$socketId]["word"] = $msg['word'];
        } else {
            $this->clients[$socketId] = ["word" => $msg['word']];
        }
    }

    public function setReady($msg, $socket, $socketId) {

        if (array_key_exists($socketId, $this->clients)) {
            $this->clients[$socketId]["ready"] = $msg['ready'];
        } else {
            $this->clients[$socketId] = ["ready" => $msg['ready']];
        }
        $this->sendNames();
    }

    public function setGamemaster($msg, $socket, $socketId) {

        foreach ($this->clients as $key => $value) {
            $wasMaster = array_key_exists("master", $value) ? $value['master'] : false;
            if($wasMaster && $msg['id'] != $key) {
                $this->sendToId($key, ["action" => "gamemaster", "gamemaster" => false]);
                $this->clients[$key]["master"] = false;
            } elseif(!$wasMaster && $msg['id'] == $key) {
                $this->sendToId($key, ["action" => "gamemaster", "gamemaster" => true]);
                $this->clients[$key]["master"] = true;
            }
        }
        $this->sendNames();
    }

    public function startRound($msg, $socket, $socketId) {
        $words = [];
        foreach ($this->clients as $key => $value) {
            $isMaster = array_key_exists("master", $value) ? $value['master'] : false;
            if(!$isMaster) array_push($words, $value['word']);
        }

        $randomWord = $words[array_rand($words)];
        $this->sendToAll(["action" => "startRound", "word" => $randomWord]);
    }

    public function restart($msg, $socket, $socketId) {
        $this->sendToAll(["action" => "restart"]);
        foreach ($this->clients as $key => $value) {
            $this->clients[$key]['ready'] = false;
            $this->clients[$key]['master'] = false;
        }
        $this->sendNames();
    }

    /**
     * @param $msg
     * @param null|socketWebSocket $except
     */
    private function sendToAll($msg, $except = null) {
        foreach ($this->socketClass->allsockets as $sock) {
            if ($sock != $except && $sock != $this->socketClass->master) $this->socketClass->send($sock, json_encode($msg));
        }
        //$this->socketClass->console("OUTGOING ".json_encode($msg));
    }

    private function sendToId($id, $msg) {
        foreach ($this->socketClass->allsockets as $sock) {
            if (intval($sock) == $id) {
                $this->socketClass->send($sock, json_encode($msg));
                //$this->socketClass->console("OUTGOING to $id: ".json_encode($msg));
                return;
            }
        }
    }

    /**
     * @param $socket
     * @param $socketIndex
     * @param int $socketId
     */
    public function socketDisconnected($_, $socket, $socketId) {
        unset($this->clients[$socketId]);
        $this->sendNames();
    }

    /**
     * @param $msg
     */
    private function sendNames() {
        $msg = array(
            "action" => "userList",
            "users" => array_map(function ($value) { return [
                "name" => $value['name'],
                "master" => array_key_exists("master", $value) ? $value['master'] : false,
                "ready" => array_key_exists("ready", $value) ? $value['ready'] : false
            ];}, $this->clients)
        );
        $this->sendToAll($msg);
    }

}

?>