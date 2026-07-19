"use client"

import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      gap={8}
      icons={{
        success: <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />,
        info: <Info className="h-3.5 w-3.5 text-primary" />,
        warning: <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />,
        error: <OctagonX className="h-3.5 w-3.5 text-destructive" />,
        loading: <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border/50 group-[.toaster]:shadow-sm group-[.toaster]:rounded-xl group-[.toaster]:px-5 group-[.toaster]:py-3",
          title: "group-[.toast]:text-[13px] group-[.toast]:font-medium group-[.toast]:leading-snug",
          description: "group-[.toast]:text-xs group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:h-8 group-[.toast]:px-3",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:h-8 group-[.toast]:px-3",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
