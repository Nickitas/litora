import * as React from "react";
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from "react-day-picker";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, buttonVariants } from "./button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("bg-popover p-2 [--cell-size:2.75rem]", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4", defaults.months),
        month: cn("flex w-full flex-col gap-4", defaults.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex items-center justify-between",
          defaults.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "size-(--cell-size)",
          defaults.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "size-(--cell-size)",
          defaults.button_next
        ),
        month_caption: cn(
          "flex h-(--cell-size) items-center justify-center px-(--cell-size)",
          defaults.month_caption
        ),
        caption_label: cn("text-sm font-medium", defaults.caption_label),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn(
          "w-(--cell-size) text-center text-xs font-normal text-muted-foreground",
          defaults.weekday
        ),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn("relative size-(--cell-size) p-0", defaults.day),
        today: cn("rounded-lg bg-muted", defaults.today),
        outside: cn("text-muted-foreground opacity-60", defaults.outside),
        disabled: cn("opacity-40", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className: rootClassName, rootRef, ...rootProps }) => (
          <div
            data-slot="calendar"
            ref={rootRef}
            className={cn(rootClassName)}
            {...rootProps}
          />
        ),
        Chevron: ({ className: iconClassName, orientation, ...iconProps }) => {
          if (orientation === "left")
            return (
              <ChevronLeft
                aria-hidden="true"
                className={cn("size-4", iconClassName)}
                {...iconProps}
              />
            );
          if (orientation === "right")
            return (
              <ChevronRight
                aria-hidden="true"
                className={cn("size-4", iconClassName)}
                {...iconProps}
              />
            );
          return (
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4", iconClassName)}
              {...iconProps}
            />
          );
        },
        DayButton: (dayProps) => <CalendarDayButton {...dayProps} />,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString("ru-RU")}
      data-selected={modifiers.selected}
      className={cn(
        "size-(--cell-size) rounded-lg border-0 text-sm font-normal data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:hover:bg-primary/90 data-[selected=true]:hover:text-primary-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Calendar };
