var Twig = require('twig');

module.exports = Twig.twig({
    id: 'round-running',
    allowInlineIncludes: true,
    data: `
<div class="container container-round-running">
    <h4>Das Wort für diese Runde:</h4>
    <div class="chosen-word">{{ word }}</div>

    {% if ownWord == true %}
        <p>Dein Wort wurde gewählt, du kannst nicht abstimmen.</p>
    
        <div class="votes">
            {% for faker in fakers %}
                <div class="btn btn-large btn-secondary btn-non-clickable">{{ faker.name }}</div>
            {% endfor %}
        </div>
    
        <p>{% if votesRemaining == 1 %}1 Person muss{% else %}{{ votesRemaining }} Personen müssen {% endif %} noch abstimmen.</p>
    {% else %}
        <h4>Wer sagt die Wahrheit?</h4>
        <div class="votes">
            {% for faker in fakers %}
                {% if vote is empty %}
                    <div class="btn btn-large btn-primary js-faker" data-id="{{ faker.voteid }}">{{ faker.name }}</div>
                {% elseif vote == faker.voteid %}
                    <div class="btn btn-large btn-primary btn-selected js-faker" data-id="{{ faker.voteid }}">{{ faker.name }}</div>
                {% else %} 
                    <div class="btn btn-large btn-secondary js-faker" data-id="{{ faker.voteid }}">{{ faker.name }}</div>
                {% endif %}
            {% endfor %}
        </div>
    
        <p>{% if votesRemaining == 1 %}1 Person muss{% else %}{{ votesRemaining }} Personen müssen{% endif %} noch abstimmen{% if vote is empty %}, inklusive dir{% endif %}.</p>
    {% endif %}
    <div class="btn btn-primary js-finish-voting">Runde beenden</div>
</div>
`
});