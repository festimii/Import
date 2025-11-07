USE [Imports];
GO

IF OBJECT_ID('dbo.WmsOrders', 'U') IS NOT NULL
    DROP TABLE dbo.WmsOrders;
GO

CREATE TABLE [dbo].[WmsOrders](
    [NarID] NVARCHAR(50) NOT NULL PRIMARY KEY,
    [OrderId] BIGINT NULL,
    [OrderTypeCode] NVARCHAR(10) NULL,
    [OrderNumber] NVARCHAR(100) NULL,
    [CustomerCode] NVARCHAR(50) NULL,
    [CustomerName] NVARCHAR(255) NULL,
    [Importer] NVARCHAR(255) NULL,
    [Article] NVARCHAR(255) NULL,
    [ArticleDescription] NVARCHAR(500) NULL,
    [ArticleCount] DECIMAL(18, 6) NULL,
    [BoxCount] DECIMAL(18, 6) NULL,
    [PalletCount] DECIMAL(18, 6) NULL,
    [OrderDate] DATETIME NULL,
    [ExpectedDate] DATETIME NULL,
    [ArrivalDate] DATETIME NULL,
    [IsRealized] NVARCHAR(10) NULL,
    [OrderStatus] NVARCHAR(10) NULL,
    [Description] NVARCHAR(1000) NULL,
    [Comment] NVARCHAR(1000) NULL,
    [SourceReference] NVARCHAR(255) NULL,
    [SourceUpdatedAt] DATETIME NULL,
    [ScheduledStart] DATETIME NULL,
    [OriginalOrderNumber] NVARCHAR(100) NULL,
    [CanProceed] BIT NULL,
    [LastSyncedAt] DATETIME NOT NULL DEFAULT (GETDATE())
);
GO

CREATE INDEX IX_WmsOrders_ArrivalDate
    ON dbo.WmsOrders (ArrivalDate);
GO

CREATE INDEX IX_WmsOrders_ExpectedDate
    ON dbo.WmsOrders (ExpectedDate);
GO
