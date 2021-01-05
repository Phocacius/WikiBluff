<?php

class LanguageUtils {

    private static $COOKIE_LIFETIME = 10 * 365 * 24 * 3600; // 10 years
    public static $LANGUAGE_KEY = "lang"; // key used as cookie name and to check $_POST and $_GET

    /**
     * Get the user language based on the following priorities:
     * - "$LANGUAGE_KEY" parameter in $_POST data
     * - "$LANGUAGE_KEY" parameter in $_GET data
     * - "$LANGUAGE_KEY" cookie
     * - preferred language from AcceptLanguage http header
     * - default language
     * @param array $supportedLanguages the language codes supported by the application
     * @param string $default the fallback language code
     * @param string|null $acceptLanguage accept language header. Defaults to  $_SERVER['HTTP_ACCEPT_LANGUAGE']
     * @param bool $saveGetPostAsCookie if set to true, if the LANGUAGE_KEY is found, in $_GET or $_POST data, it will be saved in a cookie
     */
    public static function getUserLanguage(array $supportedLanguages, $default = "en", $acceptLanguage = null, bool $saveGetPostAsCookie = false) {

        if (array_key_exists(self::$LANGUAGE_KEY, $_POST) && in_array($_POST[self::$LANGUAGE_KEY], $supportedLanguages)) {
            $lang = $_POST[self::$LANGUAGE_KEY];
            if ($saveGetPostAsCookie) self::saveUserPreference($lang);
            return $lang;
        }

        if (array_key_exists(self::$LANGUAGE_KEY, $_GET) && in_array($_GET[self::$LANGUAGE_KEY], $supportedLanguages)) {
            $lang = $_GET[self::$LANGUAGE_KEY];
            if ($saveGetPostAsCookie) self::saveUserPreference($lang);
            return $lang;
        }

        if (array_key_exists(self::$LANGUAGE_KEY, $_COOKIE) && in_array($_COOKIE[self::$LANGUAGE_KEY], $supportedLanguages)) {
            return $_COOKIE[self::$LANGUAGE_KEY];
        }

        if (!$acceptLanguage) $acceptLanguage = $_SERVER['HTTP_ACCEPT_LANGUAGE'];
        $preferred_language = self::preferred_language($supportedLanguages, $acceptLanguage);
        return $preferred_language !== null ? $preferred_language : $default;
    }

    public static function saveUserPreference($lang) {
        header("Set-Cookie: ".self::$LANGUAGE_KEY."=".$lang."; expires=Sun, 31-Dec-2099 23:59:59 GMT; Max-Age=".self::$COOKIE_LIFETIME."; samesite=strict");
    }

    /**
     * source: https://gist.github.com/Xeoncross/dc2ebf017676ae946082
     */
    private static function preferred_language(array $available_languages, string $http_accept_language) {
        $available_languages = array_flip($available_languages);

        $langs = array();
        preg_match_all('~([\w-]+)(?:[^,\d]+([\d.]+))?~', strtolower($http_accept_language), $matches, PREG_SET_ORDER);
        foreach($matches as $match) {

            list($a, $b) = explode('-', $match[1]) + array('', '');
            $value = isset($match[2]) ? (float) $match[2] : 1.0;

            if(isset($available_languages[$match[1]])) {
                $langs[$match[1]] = $value;
                continue;
            }

            if(isset($available_languages[$a])) {
                $langs[$a] = $value - 0.1;
            }

        }

        if($langs) {
            arsort($langs);
            return key($langs); // We don't need the whole array of choices since we have a match
        }
    }
}