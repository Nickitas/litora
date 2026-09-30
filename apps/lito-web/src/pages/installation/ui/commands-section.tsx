import { installationPageContent } from "../constants";
import {
  Terminal,
  TypingAnimation,
  AnimatedSpan,
} from "@/shared/shadcn/components/terminal";

export const CommandsSection = () => {
  const { cliCommands } = installationPageContent;

  return (
    <section className="space-y-4 rounded-lg border p-4 sm:p-6">
      <h2 className="text-xl font-semibold sm:text-2xl">CLI команды</h2>

      {/* Demo terminal with example command */}
      <div className="mb-6">
        <Terminal>
          <TypingAnimation>
            ./lito model erosion \ --steps 15 \ --erosion-strength 50 \
            --wave-direction 45 \ --wind-speed 14 \ --bathymetry
            data/black-sea-bathymetry.json \ --lithology
            data/black-sea-lithology.json \ --enable-lithology \ --output
            ./output/erosion-full
          </TypingAnimation>
          <AnimatedSpan className="text-primary">
            ✔ Загрузка батиметрии…
          </AnimatedSpan>
          <AnimatedSpan className="text-primary">
            ✔ Подготовка модели эрозии…
          </AnimatedSpan>
          <AnimatedSpan className="text-status-succeeded">
            ✓ Расчёт завершён. Результаты сохранены в ./output/
          </AnimatedSpan>
        </Terminal>
      </div>

      <div className="grid gap-3 text-xs sm:gap-4 sm:text-sm md:grid-cols-2">
        {cliCommands.map((cmd) => (
          <div key={cmd.command} className="rounded-md bg-muted p-3 sm:p-4">
            <code className="font-semibold">{cmd.command}</code>
            <p className="mt-2 text-muted-foreground">{cmd.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
