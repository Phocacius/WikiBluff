<?php

function getAddress() {
    $protocol = array_key_exists("HTTPS", $_SERVER) && $_SERVER['HTTPS'] == 'on' ? 'https' : 'http';
    return $protocol . '://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
}

?>

<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <title>Wikipedia-Spiel</title>
    <script src="config.js"></script>
    <link rel="stylesheet" href="css/style.css">
    <link rel="preconnect" href="https://fonts.gstatic.com">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat+Alternates:ital,wght@0,400;0,600;1,400&family=Poiret+One&display=swap"
          rel="stylesheet">

</head>
<body data-game="<?php echo $_GET['game'] ?>" data-address="<?php echo getAddress() ?>">

<div class="heading-container">

    <h1>WikiBluff</h1>
    <h2>Confidence in Competence</h2>

</div>

<div id="container">
    <div class="container">
        <div class="lds-ring">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
        </div>
    </div>
</div>
<script type="text/javascript" src="js/bundle.js"></script>

</body>
</html>

