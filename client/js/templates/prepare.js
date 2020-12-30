var Twig = require('twig');

module.exports = Twig.twig({
    id: 'prepare',
    allowInlineIncludes: true,
    data: `
<div class="container">
    <div class="flex-container">
    
        <div class="flex-item">
    
            <div class="join-container">
                <h3>Dein Name</h3>
                <input type="text" class="form-control js-name">
            </div>
    
            <div class="join-container">
                <h3>Willst du ein Wort vorstellen?</h3>
                <p class="description">Dein Wort sollte nicht allgemein bekannt sein. Je abstruser der Begriff, desto besser. Namen von Personen oder Wörter bei denen die Interpretationen nur in eine Richtung gegen sollten vermieden werden.</p>
                <p class="description">Du kannst auch ohne Wort teilnehmen, dann wirst du auf jeden Fall improvisieren müssen.</p>
                <label>
                    Dein Wort
                    <input type="text" class="form-control js-word">
                </label>
                <button class="btn btn-secondary text-center js-join-fakers">Faker werden</button>
            </div>
    
            <div class="join-container">
                <h3>Willst du mitraten?</h3>
                <button class="btn btn-secondary text-center js-join-guessers">Guesser werden</button>
            </div>
    
        </div>
    
        <div class="flex-item" id="guesser-faker-container">
            {% include 'guessers-fakers' %}
        </div>
    
    </div>
    
    <div class="flex-container">
    
        <div class="flex-item">
            <label>Teile den Link und lade andere ein!
                <input type="text" class="form-control js-share" readonly value="{{ address }}">
            </label>
        </div>
    
        <div class="flex-item">
            <button class="btn btn-primary btn-lg text-center js-start-round">Runde Starten!</button>
        </div>
    
    </div>
</div>
`
});