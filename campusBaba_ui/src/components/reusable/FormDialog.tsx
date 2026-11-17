"use client"

import * as React from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface FormDialogProps {
    open: boolean
    onClose: () => void
    title: string
    description?: string
    children: React.ReactNode
    className?: string
}

export function FormDialog({
    open,
    onClose,
    title,
    description,
    children,
    className,
}: FormDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className={cn("flex flex-col max-h-[90vh] overflow-hidden p-0 gap-0", className)}>
                {/* Sticky header */}
                <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0 bg-muted/20">
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>
                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-6 py-5">
                    {children}
                </div>
            </DialogContent>
        </Dialog>
    )
}