import { Link } from "react-router";
import { Button } from "@/shared/shadcn/components/ui/button";
import { aboutPageContent } from "../constants";

export const Repository = () => {
  const { repository } = aboutPageContent;

  return (
    <section className="rounded-lg bg-muted/50 p-4 sm:p-6">
      <h2 className="mb-2 text-lg font-semibold sm:text-xl">
        {repository.title}
      </h2>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
        {repository.description}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link to="/lab">Открыть лабораторию</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/downloads">Скачать CLI</Link>
        </Button>
        <a
          href={repository.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          Исходный код на GitHub
        </a>
      </div>
    </section>
  );
};
