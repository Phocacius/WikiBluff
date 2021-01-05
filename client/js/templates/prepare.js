var Twig = require('twig');

module.exports = Twig.twig({
    id: 'prepare',
    allowInlineIncludes: true,
    data: `
<div class="container">
    <div class="flex-container">
    
        <div class="flex-item">
    
            <div class="join-container">
                <h3>{{ lang.yourName }}</h3>
                <input type="text" class="form-control js-name">
            </div>
    
            <div class="join-container">
                {{ lang.yourWordIntro }}
                <label>
                    {{ lang.yourWord }}
                    <input type="text" class="form-control js-word">
                </label>
                <button class="btn btn-secondary text-center js-join-fakers">{{ lang.joinFakers }}</button>
            </div>
    
            <div class="join-container">
                <h3>{{ lang.joinGuessersIntro }}</h3>
                <button class="btn btn-secondary text-center js-join-guessers">{{ lang.joinGuessers }}</button>
            </div>
    
        </div>
    
        <div class="flex-item" id="guesser-faker-container">
            {% include 'guessers-fakers' %}
        </div>
    
    </div>
    
    <div class="flex-container">
    
        <div class="flex-item">
            <label>{{ lang.share }}
                <input type="text" class="form-control js-share" readonly value="{{ address }}">
            </label>
        </div>
    
        <div class="flex-item">
            <button class="btn btn-primary btn-lg text-center js-start-round">{{ lang.startRound }}</button>
        </div>
    
    </div>
</div>
`
});