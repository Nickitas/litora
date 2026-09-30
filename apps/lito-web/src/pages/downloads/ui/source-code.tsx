import { downloadsPageContent } from "../constants";
import { Button } from "@/shared/shadcn/components/ui/button";

export const SourceCode = () => {
  const { sourceCode } = downloadsPageContent;

  return (
    <section className="rounded-lg border p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold sm:text-xl">
        {sourceCode.title}
      </h2>
      <p className="text-sm text-muted-foreground sm:text-base">
        {sourceCode.description}
      </p>
      <div className="mt-4">
        <Button asChild variant="outline">
          <a href={sourceCode.url} target="_blank" rel="noopener noreferrer">
            {sourceCode.buttonText}
          </a>
        </Button>
      </div>
    </section>
  );
};
