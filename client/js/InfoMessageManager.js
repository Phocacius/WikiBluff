var $ = require('jquery');

var InfoMessageManager = function (el, params) {
    this.initialised = false;
};

InfoMessageManager.prototype.init = function () {
    this.$container = $(document.createElement("div"));
    this.$container.addClass("alert");
    this.$container
        .css("position", "fixed")
        .css("left", "50%")
        .css("transform", "translateX(-50%)")
        .css("bottom", "20px");
    this.$container.hide();
    $("body").append(this.$container);

    this.currentTimeout = -1;
    this.initialised = true;
};

InfoMessageManager.prototype.showSuccess = function (msg) {
    if (!this.initialised) this.init();
    this.$container.addClass("alert-success").removeClass("alert-danger");
    this.post(msg);
};

InfoMessageManager.prototype.showError = function (msg) {
    if (!this.initialised) this.init();
    this.$container.addClass("alert-danger").removeClass("alert-success");
    this.post(msg);
};

InfoMessageManager.prototype.handleSuccessfulAjax = function(res) {
    this.showSuccess(res.message);
};

InfoMessageManager.prototype.handleFailedAjax = function(res) {
    console.error(res);

    var msg = "Es ist ein Fehler aufgetreten.";
    if (res.responseText) {
        try {
            var parsed = JSON.parse(res.responseText);
            msg = parsed.message;
        } catch (e) {
            // no json, just show general message
        }
    }
    this.showError(msg);
};

InfoMessageManager.prototype.post = function (msg) {
    if (!this.initialised) this.init();
    this.$container.text(msg);
    this.$container.show();

    if (this.currentTimeout !== -1) {
        clearTimeout(this.currentTimeout)
    }

    this.currentTimeout = setTimeout(function () {
        this.$container.hide();
        this.currentTimeout = -1;
    }.bind(this), 4000);
};


module.exports = new InfoMessageManager();
