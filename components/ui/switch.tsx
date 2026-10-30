"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

/** macOS switch (NSSwitch): 38×22 capsule, white knob with a soft shadow, accent fill when on. */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full p-[2px] outline-none transition-colors duration-200 after:absolute after:-inset-x-2 after:-inset-y-1.5",
        "data-[size=default]:h-[22px] data-[size=default]:w-[38px] data-[size=sm]:h-[16px] data-[size=sm]:w-[26px]",
        "data-checked:bg-primary data-unchecked:bg-white/[0.16] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.25)]",
        "focus-visible:shadow-[0_0_0_3px_rgb(245_185_113/0.45)] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.35),0_0_0_0.5px_rgb(0_0_0/0.08)] transition-transform duration-200 ease-[cubic-bezier(0.3,0.7,0.4,1)] group-data-[size=default]/switch:size-[18px] group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-4 group-data-[size=sm]/switch:data-checked:translate-x-[10px] data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
