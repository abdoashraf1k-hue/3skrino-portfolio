import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import SearchResults from "@/components/ui/SearchResults";
import { pageMetadata } from "@/lib/seo";
import { CONTAINER, cn } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  title: "Search",
  description: "Search every project by title, field, client, tool or keyword.",
  path: "/search",
});

export default function SearchPage() {
  return (
    <>
      <PageHeader label="(Search) Everything" title="Find it." />
      <section className={cn(CONTAINER, "pb-24 md:pb-40")}>
        <SearchResults />
      </section>
    </>
  );
}
