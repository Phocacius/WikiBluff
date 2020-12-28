# Wikipedia-Spiel
For explaining the basic principle: [See here](https://www.youtube.com/watch?v=3UAOs9B9UH8&ab_channel=MattandTom)

## Requirements
### Requirements for Client Server
- Apache2 (nginx should also work)
- PHP>=7.0

### Requirements for Websocket Server
- Java-Plattform >= 7.0

## Installation
Duplicate `config.sample.js`, rename to `config.js` and fill in server address and port. This file will be used by both the client and the server.

### Local Installation for Client Server
- Install node.js and npm (comes with node)
- Install sass (css preprocessor)
- Globally install browserify: `npm install -g browserify`
- execute `npm install` in the `js` directory
- For compiling javascript: `browserify js/main.js -o js/bundle.js`
- For compiling sass: `sass sass/frontend.scss css/style.css`

### Local Installation for Websocket Server
- Install gradle build system (comes bundled with Intellij IDEA)
- Install kotlin platform
- For creating an executable fat jar: `./gradlew shadowJar`
