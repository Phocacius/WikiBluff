var Twig = require('twig');

module.exports = Twig.twig({
    id: 'revelation',
    allowInlineIncludes: true,
    data: `
<div class="container container-revelation">
    <h4>{{ lang.revelationWord }}</h4>
    <div class="chosen-word">{{ word }}</div>
    
    <div class="votes-result">
        {% for faker in fakers %}
            <div class="vote-result {% if faker.wasChosen == true %}vote-result--chosen{% endif %}">
                <div class="btn btn-large btn-non-clickable {% if faker.wasChosen == true %}btn-primary{% else %}btn-secondary{% endif %}">
                    {{ faker.name }}{% if faker.wasChosen == true %}<br><small>{{ lang.wasRight }}</small>{% endif %}
                </div>
                <ul class="voted-for">
                    {% for voter in faker.votedFor %}
                        <li>{{ voter }}</li>
                    {% endfor %}
                </ul>
            </div>
        {% endfor %}
    </div>
    
    {% for wiki in wikipedia %}
    <p>{{ wiki.text }}</p>
    <p><a href="{{ wiki.link }}" target="_blank">{{ lang.readWikipedia}}</a></p>
    {% endfor %}

    <button class="btn btn-primary btn-lg text-center js-restart">{{ lang.restart }}</button>
</div>
`
});