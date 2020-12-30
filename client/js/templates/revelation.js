var Twig = require('twig');

module.exports = Twig.twig({
    id: 'revelation',
    allowInlineIncludes: true,
    data: `
<div class="container container-revelation">
    <h4>Das Wort war:</h4>
    <div class="chosen-word">{{ word }}</div>
    
    <div class="votes-result">
        {% for faker in fakers %}
            <div class="vote-result {% if faker.wasChosen == true %}vote-result--chosen{% endif %}">
                <div class="btn btn-large btn-non-clickable {% if faker.wasChosen == true %}btn-primary{% else %}btn-secondary{% endif %}">
                    {{ faker.name }}{% if faker.wasChosen == true %}<br><small>hatte recht</small>{% endif %}
                </div>
                <ul class="voted-for">
                    {% for voter in faker.votedFor %}
                        <li>{{ voter }}</li>
                    {% endfor %}
                </ul>
            </div>
        {% endfor %}
    </div>
    
    <p>{{ wikipediaText }}</p>
    <p><a href="{{ wikipediaLink }}" target="_blank">Artikel lesen</a></p>

    <button class="btn btn-primary btn-lg text-center js-restart">Neue Runde</button>
</div>
`
});