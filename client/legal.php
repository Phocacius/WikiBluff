<?php
spl_autoload_register(function ($classname) { require_once("classes/" . $classname . ".php"); });
$language = LanguageUtils::getUserLanguage(["de", "en"], "en", null, true);
$languageJson = file_get_contents("lang/$language.json");
$lang = json_decode($languageJson, true);
?>
<!DOCTYPE html>
<html lang="<?php echo $language; ?>">
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
    <link rel="alternate" hreflang="<?php echo $lang['langSwitchCode']; ?>" href="<?php echo $_SERVER['REQUEST_SCHEME'] . "://" . $_SERVER['HTTP_HOST'] . strtok($_SERVER["REQUEST_URI"], '?') . "?lang=" . $lang['langSwitchCode']; ?>">

</head>
<body>


<div class="heading-container">

    <a href="/"><h1><?php echo $lang['mainHeading']; ?></h1>
        <h2><?php echo $lang['subHeading']; ?></h2></a>

</div>

<div class="container legal" id="container">
    <h1><?php echo $lang['impressum']; ?></h1>
    <?php require_once ("legal_$language.php"); ?>
</div>

<div class="heading-container">
    <div style="text-align: center;">
        <a href="legal.php"><?php echo $lang['impressum']; ?></a> &mdash; <a
                href="?lang=<?php echo $lang['langSwitchCode']; ?>"><?php echo $lang['langSwitchName']; ?></a>
    </div>
</div>

<?php
require_once "matomo.php";
?>

</body>
</html>