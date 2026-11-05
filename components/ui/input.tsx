import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

/** macOS text field: 13pt, 6pt corners, recessed fill, accent focus halo. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-7 w-full min-w-0 rounded-md bg-black/25 px-2 text-[13px] text-foreground outline-none transition-shadow",
        "shadow-[inset_0_0.5px_1px_rgb(0_0_0/0.35),inset_0_0_0_0.5px_rgb(255_255_255/0.12)] placeholder:text-white/30",
        "focus-visible:shadow-[inset_0_0_0_0.5px_rgb(245_185_113/0.8),0_0_0_3px_rgb(245_185_113/0.4)]",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:shadow-[0_0_0_3px_rgb(255_69_58/0.45)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
