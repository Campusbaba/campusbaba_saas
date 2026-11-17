"use client"

import * as React from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
    open: boolean
    onClose: () => void
    onConfirm: () => void
    loading?: boolean
    message: string
    title?: string
    confirmText?: string
    cancelText?: string
    variant?: "default" | "destructive"
}

export function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    loading = false,
    message,
    title = "Confirm Action",
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "destructive",
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !loading && onClose()}>
            <DialogContent className="sm:max-w-md" showCloseButton={!loading}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="pt-1">{message}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="pt-2">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={loading}
                        type="button"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={variant}
                        onClick={onConfirm}
                        disabled={loading}
                        type="button"
                    >
                        {loading ? "Processing..." : confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
