import { aboutPageContent } from "../constants";

export const HeroSection = () => {
  const { hero } = aboutPageContent;

  return (
    <header className="rounded-2xl border bg-card p-6 text-card-foreground sm:p-10">
      <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
        О проекте
      </p>
      <h1 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">
        {hero.title}
      </h1>
      <p className="mt-5 max-w-3xl text-xl font-semibold text-primary sm:text-2xl">
        {hero.subtitle}
      </p>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
        {hero.description}
      </p>
    </header>
  );
};
