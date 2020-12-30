<?php
function randString($length) {
    $char = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    $char = str_shuffle($char);
    for($i = 0, $rand = '', $l = strlen($char) - 1; $i < $length; $i ++) {
        $rand .= $char{mt_rand(0, $l)};
    }
    return $rand;
}

?>
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Wikipedia-Spiel</title>
    <script src="config.js"></script>
    <link rel="stylesheet" href="css/style.css">
    <link rel="preconnect" href="https://fonts.gstatic.com">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat+Alternates:ital,wght@0,400;0,600;1,400&family=Poiret+One&display=swap"
          rel="stylesheet">

</head>
<body>


<div class="heading-container">

    <h1>WikiBluff</h1>
    <h2>Confidence in Competence</h2>

</div>

<div class="container" id="container">
    <p>WikiBluff ist ein Spiel, in dem Wissen aus der Wikipedia vorgetäuscht, aber auch vermittelt wird. Jeder
        Mitspieler (<i>Faker</i>) sucht sich ein Wort aus der Wikipedia heraus und liest den entsprechenden Artikel
        durch. Dann wird aus allen Wörtern eines zufällig ausgewählt. Jeder versucht nun, die <i>Guesser</i> davon zu
        überzeugen, dass das ausgewählte Wort das eigene ist. Dabei kann irgendeine Geschichte ausgedacht werden. Am
        besten funktioniert es, wenn zunächst jeder nur einen Satz sagt, danach können die Guesser gezielte Fragen
        stellen, um herauszufinden, welche Geschichte die wahre ist. Im Anschluss wird abgestimmt, wer wohl die Wahrheit
        gesagt hat. </p>
    <p>Die Inspiration kam vom YouTube-Kanal von <a href="https://www.youtube.com/channel/UCRUULstZRWS1lDvJBzHnkXA"
                                                    target="_blank">Tom Scott</a>, ein Beispiel-Video in dem auch die
        Regeln nochmal erklärt werden gibt es <a href="https://www.youtube.com/watch?v=3UAOs9B9UH8" target="_blank">
            hier</a>.</p>

    <div class="new-game">
        <a href="<?php echo randString(6); ?>" class="btn btn-primary">Neues Spiel starten</a>
    </div>
</div>

<script type="text/javascript" src="js/bundle.js"></script>
</body>
</html>