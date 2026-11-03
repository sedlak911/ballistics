/** Loads another page, as a link would: the one seam tests mock, since jsdom can't navigate between documents. */
export const leave = (href: string): void => window.location.assign(href)
