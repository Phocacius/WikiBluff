# Wikipedia-Spiel
For explaining the basic principle: [See here](https://www.youtube.com/watch?v=3UAOs9B9UH8&ab_channel=MattandTom)

## Requirements
- Apache2 (nginx should also work)
- PHP>=7.0

## Installation
Duplicate `config.sample.js`, rename to `config.js` and fill in server address and port. This file will be used by both the client and the server.

## Usage
For running the server, execute `php -f server/startDaemon.php`

For the client, just move the whole project into your webserver's html directory.