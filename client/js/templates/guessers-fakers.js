var Twig = require('twig');

module.exports = Twig.twig({
    id: 'guessers-fakers',
    allowInlineIncludes: true,
    data: `
<div class="guesser-faker-container" id="guessers">
    <h3>{{ lang.guessers }}</h3>

    {% if guessers is empty %}
        {{ lang.noGuessers }}
    {% else %}

        <ul class="guessers">
            {% for guesser in guessers %}
                <li>{{ guesser.name }}</li>
            {% endfor %}
        </ul>
    {% endif %}
</div>

<div class="guesser-faker-container" id="fakers">
    <h3>{{ lang.fakers }}</h3>
    {% if fakers is empty %}
        {{ lang.noFakers }}
    {% else %}
        <ul class="fakers">
            {% for faker in fakers %}
                <li>{{ faker.name }}</li>
            {% endfor %}
        </ul>
    {% endif %}
</div>
`
});