import { Hero } from "@/shared/ui/hero";
import { Globe } from "@/shared/shadcn/components/ui/globe";
import { homePageContent } from "../constants";

export const HeroSection = () => {
  const { hero } = homePageContent;

  const visualContent = (
    <div className="relative top-0">
      <Globe className="z-10" />
    </div>
  );

  return (
    <Hero
      title={hero.title}
      subtitle={hero.subtitle}
      description={hero.description}
      badges={hero.badges}
      ctaButtons={hero.ctaButtons}
      visualContent={visualContent}
    />
  );
};
