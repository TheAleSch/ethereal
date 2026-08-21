/** Which element the playground previews the effect on. Its own module so the
 *  snippet builder can import it without pulling in the whole playground. */
export type PreviewHostKind = "button" | "chat" | "card" | "pill"
