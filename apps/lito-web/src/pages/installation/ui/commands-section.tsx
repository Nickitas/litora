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

      {/* Пример команды с явно выбранными входными файлами. */}
      <div className="mb-6">
        <Terminal>
          <TypingAnimation>
            ./lito erosion --input data/coast-segment.geojson --wave-input
            data/waves.csv --bathymetry data/bathymetry.json --output output/research
          </TypingAnimation>
          <AnimatedSpan className="text-primary">
            Замените пути своими сохранёнными файлами участка.
          </AnimatedSpan>
          <AnimatedSpan className="text-primary">
            Рядом с батиметрией подготовьте её паспорт .metadata.json.
          </AnimatedSpan>
          <AnimatedSpan className="text-status-succeeded">
            Пустой запуск не подставляет демонстрационные данные.
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
