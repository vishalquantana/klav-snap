// Coexistence: the embeddable widget mounts a Shadow host #klavity-widget-host.
// Content scripts run in an isolated world and can't read page window vars, so we
// detect the widget purely via the DOM and YIELD our report UI to it. Widget always wins.
export function widgetPresent(): boolean {
  return !!document.getElementById('klavity-widget-host')
}
