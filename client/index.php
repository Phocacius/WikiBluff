<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<title>Wikipedia-Spiel</title>
<script src="config.js"></script>
<link rel="stylesheet" href="css/bootstrap.min.css">
<link rel="stylesheet" href="css/bootstrap-responsive.min.css">
<link rel="stylesheet" href="css/style.css">

</head>
<body>

  <div class="container" id="container">
      <h1>Wikipedia-Spiel</h1>
      Dein Name: <input type="text" class="name" /> <br>
      Dein Wort: <input type="text" class="word" /> <span class="ratender hide">Du darfst raten!</span><span class="nicht-ratender"><button class="btn btn-primary ready">Ich bin bereit!</button><button class="btn btn-danger hide unready">Ich bin doch nicht mehr bereit</button></span><br>

      <h3>Mitspieler-Liste</h3>
      <p>Die ratende Person durch Klicken auf die Buttons auswählen</p>

      <div class="userlist">

      </div>

      <div class="messages"></div>
      <button class="btn btn-primary hide lets-go">Runde starten</button>

      <br><br>

      <div class="the-word-wrapper hide">Das Wort für diese Runde lautet ...</div>
      <h2 class="the-word hide"></h2>

      <button class="btn hide restart">Neue Runde starten</button>
  </div>

  <script src="js/jquery.min.js"></script>
  <script type="text/javascript" src="js/client.js"></script>
</body>
</html>​