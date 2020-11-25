<?php
/**
 * Main Script of phpWebSockets
 *
 * Run this file in a shell or windows cmd to start the socket server.
 * Sorry for calling this daemon but the goal is that this server run
 * as daemon in near future.
 *
 * @author Moritz Wutz <moritzwutz@gmail.com>
 * @version 0.1
 * @package phpWebSockets
 */
//error_reporting(E_WARNING | E_ERROR);
error_reporting(E_ALL ^ (E_STRICT | E_NOTICE));
date_default_timezone_set("Europe/Berlin");

ob_implicit_flush(true);

require 'socket.class.php';
require 'socketWebSocket.class.php';
require 'WikipediaActions.php';

$WebSocket = new socketWebSocket();
$actions = new WikipediaActions($WebSocket);

$WebSocket->registerAction($actions, "setName", "setName");
$WebSocket->registerAction($actions, "setWord", "setWord");
$WebSocket->registerAction($actions, "setGamemaster", "setGamemaster");
$WebSocket->registerAction($actions, "setReady", "setReady");
$WebSocket->registerAction($actions, "startRound", "startRound");
$WebSocket->registerAction($actions, "restart", "restart");

// Pseudo-Action, die von der Socket-Klasse aufgerufen wird, wenn sich ein Socket abmeldet
$WebSocket->registerAction($actions, "disconnected", "socketDisconnected");
$WebSocket->run();

?>