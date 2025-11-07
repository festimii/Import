USE [Imports];
GO

IF OBJECT_ID('dbo.WmsOrders', 'U') IS NOT NULL
    DROP TABLE dbo.WmsOrders;
GO

CREATE TABLE [dbo].[WmsOrders](
    [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [OrderId] INT NOT NULL,
    [OrderTypeCode] NVARCHAR(10) NULL,
    [OrderNumber] NVARCHAR(50) NULL,
    [CustomerCode] NVARCHAR(50) NULL,
    [CustomerName] NVARCHAR(255) NULL,
    [OrderDate] DATETIME2 NULL,
    [ExpectedDate] DATETIME2 NULL,
    [IsRealized] NVARCHAR(10) NULL,
    [OrderStatus] NVARCHAR(10) NULL,
    [Description] NVARCHAR(500) NULL,
    [SourceReference] NVARCHAR(100) NULL,
    [ScheduledStart] DATETIME2 NULL,
    [OriginalOrderNumber] NVARCHAR(100) NULL,
    [CanProceed] BIT NULL,
    [LastSyncedAt] DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_WmsOrders_OrderId UNIQUE (OrderId)
);
GO

CREATE INDEX IX_WmsOrders_ExpectedDate
    ON dbo.WmsOrders (ExpectedDate, OrderDate);
GO
