var Twig = require('twig');

module.exports = Twig.twig({
    id: 'round-running',
    allowInlineIncludes: true,
    data: `
<div class="container container-round-running">
    <h4>{{ lang.roundRunningWord }}</h4>
    <div class="chosen-word">{{ word }}</div>

    {% if ownWord == true %}
        <p>{{ lang.ownWord }}</p>
    
        <div class="votes">
            {% for faker in fakers %}
                <div class="btn btn-large btn-secondary btn-non-clickable">{{ faker.name }}</div>
            {% endfor %}
        </div>
    
        <p>{% if votesRemaining == 1 %}{{ lang.votesRemaining1 }}{% else %}{{ votesRemaining }} {{ lang.votesRemainingN }}{% endif %}</p>
    {% elseif canVote == false %}
        <p>{{ lang.noVoteForSpectator }}</p>
    
        <div class="votes">
            {% for faker in fakers %}
                <div class="btn btn-large btn-secondary btn-non-clickable">{{ faker.name }}</div>
            {% endfor %}
        </div>
    
        <p>{% if votesRemaining == 1 %}{{ lang.votesRemaining1 }}{% else %}{{ votesRemaining }} {{ lang.votesRemainingN }}{% endif %}</p>
    {% else %}
        <h4>{{ lang.voteHeading }}</h4>
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
    
        <p>{% if votesRemaining == 1 %}
            {% if vote is empty %}{{ lang.votesRemaining1You }}{% else %}{{ lang.votesRemaining1 }}{% endif %}
        {% else %}
            {{ votesRemaining }} {% if vote is empty %}{{ lang.votesRemainingNYou }}{% else %}{{ lang.votesRemainingN }}{% endif %}
        {% endif %}
    {% endif %}
    <div class="btn btn-primary js-finish-voting">{{ lang.finishVoting }}</div>
</div>
`
});