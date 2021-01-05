<?php

function getAddress() {
    $protocol = array_key_exists("HTTPS", $_SERVER) && $_SERVER['HTTPS'] == 'on' ? 'https' : 'http';
    return $protocol . '://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
}

spl_autoload_register(function($classname) { require_once("classes/".$classname.".php"); });
$language = LanguageUtils::getUserLanguage(["de", "en"], "en", null, true);
$languageJson = file_get_contents("lang/$language.json");
$lang = json_decode($languageJson, true);

?>

<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo $lang['htmlTitle']; ?></title>
    <script src="config.js"></script>
    <script type="text/javascript">var lang = <?php echo $languageJson; ?>;</script>
    <link rel="stylesheet" href="css/style.css">
    <link rel="preconnect" href="https://fonts.gstatic.com">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat+Alternates:ital,wght@0,400;0,600;1,400&family=Poiret+One&display=swap"
          rel="stylesheet">

</head>
<body data-game="<?php echo $_GET['game'] ?>" data-address="<?php echo getAddress() ?>">

<div class="heading-container">

    <a href="/"><h1><?php echo $lang['mainHeading']; ?></h1>
        <h2><?php echo $lang['subHeading']; ?></h2></a>

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


<div class="heading-container">
    <div style="text-align: center;">
        <a href="legal.php"><?php echo $lang['impressum']; ?></a> &mdash; <a
                href="?lang=<?php echo $lang['langSwitchCode']; ?>"><?php echo $lang['langSwitchName']; ?></a>
    </div>
</div>

<script type="text/javascript" src="js/bundle.js"></script>

</body>
</html>

