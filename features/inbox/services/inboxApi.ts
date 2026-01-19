export const fetchInboxConversations = (query: string) =>
  fetch(`/api/wrk/inbox?${query}`);
