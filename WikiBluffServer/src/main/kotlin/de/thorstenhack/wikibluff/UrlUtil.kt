package de.thorstenhack.wikibluff

import kotlin.Throws
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.IOException
import java.io.UnsupportedEncodingException
import java.lang.Exception
import java.lang.StringBuilder
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * A complete Java class that shows how to open a URL, then read data (text) from that URL,
 * HttpURLConnection class (in combination with an InputStreamReader and BufferedReader).
 *
 * @author alvin alexander, http://alvinalexander.com.
 */
object UrlUtil {
    /**
     * Returns the output from the given URL.
     *
     *
     * I tried to hide some of the ugliness of the exception-handling
     * in this method, and just return a high level Exception from here.
     * Modify this behavior as desired.
     */
    @Throws(Exception::class)
    fun loadUrl(desiredUrl: String?): String {
        var url: URL? = null
        var reader: BufferedReader? = null
        val stringBuilder: StringBuilder
        return try {
            // create the HttpURLConnection
            url = URL(desiredUrl)
            val connection = url.openConnection() as HttpURLConnection

            // just want to do an HTTP GET here
            connection.requestMethod = "GET"

            // uncomment this if you want to write output to this url
            //connection.setDoOutput(true);

            // give it 15 seconds to respond
            connection.readTimeout = 15 * 1000
            connection.connect()

            // read the output from the server
            reader = BufferedReader(InputStreamReader(connection.inputStream))
            stringBuilder = StringBuilder()
            var line: String? = null
            while (reader.readLine().also { line = it } != null) {
                stringBuilder.append(line).append("\n")
            }
            stringBuilder.toString()
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        } finally {
            // close the reader; this can throw an exception too, so
            // wrap it in another try/catch block.
            if (reader != null) {
                try {
                    reader.close()
                } catch (ioe: IOException) {
                    ioe.printStackTrace()
                }
            }
        }
    }

    /**
     * Encodes the passed String as UTF-8 using an algorithm that's compatible
     * with JavaScript's `encodeURIComponent` function. Returns
     * `null` if the String is `null`.
     *
     * @param s The String to be encoded
     * @return the encoded String
     */
    fun encodeURIComponent(s: String?): String? {
        var result: String? = null
        result = try {
            URLEncoder.encode(s, "UTF-8")
                .replace("\\+".toRegex(), "%20")
                .replace("\\%21".toRegex(), "!")
                .replace("\\%27".toRegex(), "'")
                .replace("\\%28".toRegex(), "(")
                .replace("\\%29".toRegex(), ")")
                .replace("\\%7E".toRegex(), "~")
        } // This exception should never occur.
        catch (e: UnsupportedEncodingException) {
            s
        }
        return result
    }
}