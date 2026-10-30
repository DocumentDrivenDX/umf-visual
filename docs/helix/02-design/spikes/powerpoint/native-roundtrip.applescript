-- Prepare native edits only. Reconnection/save/reopen are explicit UI steps, not an automated passing claim.
on run argv
 set outputDir to item 1 of argv
 with timeout of 45 seconds
  tell application "/Applications/Microsoft PowerPoint.app"
   if (count argv) is 1 then
   open (POSIX file (outputDir & "/baseline.pptx"))
   set p to presentation "baseline.pptx"
   if full name of p is not (outputDir & "/baseline.pptx") then error "Wrong presentation; refusing mutation"
   save p in (POSIX file (outputDir & "/native-noop.pptx")) as save as Open XML presentation
   close presentation "native-noop.pptx" saving no
   end if
   open (POSIX file (outputDir & "/native-noop.pptx"))
   set p to presentation "native-noop.pptx"
   if full name of p is not (outputDir & "/native-noop.pptx") then error "Wrong presentation; refusing mutation"
   set s to slide 1 of p
   set content of text range of text frame of shape "umf-title" of s to "Native round trip verified"
   set content of text range of text frame of shape "umf-question" of s to "What changed in PowerPoint?"
   set content of text range of text frame of shape "umf-node-client" of s to "Browser café 東京"
   set content of text range of text frame of shape "umf-edge-request-label" of s to "Fetch via PowerPoint"
   set top of shape "umf-node-client" of s to 260
   -- The tested Mac end-connect AppleEvent failed; use PowerPoint's endpoint drag.
   return "Prepared native text and movement edits. In PowerPoint, drag the connector target from API to Store, Save As native-edited.pptx, close and reopen. Then run roundtrip-run.ts verify."
  end tell
 end timeout
end run
