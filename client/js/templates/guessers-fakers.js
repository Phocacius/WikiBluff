var Twig = require('twig');

module.exports = Twig.twig({
    id: 'guessers-fakers',
    allowInlineIncludes: true,
    data: `
<div class="guesser-faker-container" id="guessers">
    <h3>Guessers</h3>

    {% if guessers is empty %}
        Noch keine Guessers registriert.
    {% else %}

        <ul class="guessers">
            {% for guesser in guessers %}
                <li>{{ guesser.name }}</li>
            {% endfor %}
        </ul>
    {% endif %}
</div>

<div class="guesser-faker-container" id="fakers">
    <h3>Fakers</h3>
    {% if fakers is empty %}
        Noch keine Fakers registriert.
    {% else %}
        <ul class="fakers">
            {% for faker in fakers %}
                <li>{% if faker.ready == true %}<strong>{% endif %}{{ faker.name }}{% if faker.ready == true %}</strong>{% endif %} (bereit)</li>
            {% endfor %}
        </ul>
    {% endif %}
</div>
`
});