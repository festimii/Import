USE [Imports];
GO

IF OBJECT_ID('dbo.WmsOrders', 'U') IS NOT NULL
    DROP TABLE dbo.WmsOrders;
GO

CREATE TABLE [dbo].[WmsOrders](
    [NarID] NVARCHAR(50) NOT NULL PRIMARY KEY,
    [OrderNumber] NVARCHAR(100) NULL,
    [Importer] NVARCHAR(150) NULL,
    [Article] NVARCHAR(255) NULL,
    [ArticleDescription] NVARCHAR(500) NULL,
    [BoxCount] DECIMAL(18, 6) NULL,
    [PalletCount] DECIMAL(18, 6) NULL,
    [ArrivalDate] DATETIME NULL,
    [Comment] NVARCHAR(1000) NULL,
    [SourceUpdatedAt] DATETIME NULL,
    [LastSyncedAt] DATETIME NOT NULL DEFAULT (GETDATE())
);
GO

CREATE INDEX IX_WmsOrders_ArrivalDate
    ON dbo.WmsOrders (ArrivalDate);
GO
