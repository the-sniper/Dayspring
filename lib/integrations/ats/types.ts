export type NormalizedJob = {
  externalId: string;
  title: string;
  url: string;
  location: string | null;
  postedAt: string | null;
  descriptionText: string;
};

export type AtsAdapter = (slug: string) => Promise<NormalizedJob[]>;
