/**
 * Widget WordPress / site client.
 *
 * <script src="https://ticketick.ch/embed.js" data-event="slug-du-spectacle"></script>
 */
(function () {
  var script = document.currentScript;
  if (!script || !script.getAttribute) return;

  var slug = (script.getAttribute("data-event") || "").trim();
  if (!slug) return;

  var locale = (script.getAttribute("data-locale") || "").trim();
  var origin = script.src.replace(/\/embed\.js(?:\?.*)?$/i, "");
  var prefix = locale && locale !== "fr" ? "/" + encodeURIComponent(locale) : "";

  var frame = document.createElement("iframe");
  frame.src =
    origin + prefix + "/embed/events/" + encodeURIComponent(slug);
  frame.title = script.getAttribute("data-title") || "Billetterie";
  frame.loading = "lazy";
  frame.style.cssText =
    "border:0;width:100%;max-width:720px;min-height:640px;display:block;";
  frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");

  script.parentNode.insertBefore(frame, script);

  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "ticketick-embed") return;
    if (event.source !== frame.contentWindow) return;
    var height = Number(event.data.height);
    if (height > 80) frame.style.height = height + "px";
  });
})();
