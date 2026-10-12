// Resident artists. Every music station has a roster of regulars who turn up on about two
// tracks in five, so listeners get to know them. The director hashes `TrackMeta.artist`
// into `TrackRequest.artist` and the music engine turns that into a signature sound, so a
// resident always sounds like themselves ("another one by the late bus").
//
// A pack opts in with two rules: `residents` (6–10 fixed names, no grammar tokens, so the
// name, and therefore the sound, is identical every time) and `guestArtist` (everyone
// else, usually generated). Then it sets `artist: RESIDENT_SHARE`. Hosts name-check some
// residents in their voice scripts (content/voice/*.toml), so keep the names stable.

/** Two residents to every three guests. */
export const RESIDENT_SHARE: readonly string[] = ['#residents#', '#residents#', '#guestArtist#', '#guestArtist#', '#guestArtist#'];
