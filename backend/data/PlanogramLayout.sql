USE [Imports];
GO

IF OBJECT_ID('dbo.PlanogramLayout', 'U') IS NOT NULL
    DROP TABLE dbo.PlanogramLayout;
GO

CREATE TABLE dbo.PlanogramLayout (
    Sifra_Art     VARCHAR(20) NOT NULL,
    Internal_ID   VARCHAR(20) NOT NULL,
    Module_ID     VARCHAR(20) NULL,  -- Shelf module number
    X             DECIMAL(18, 2) NULL, -- Width or position X
    Y             DECIMAL(18, 2) NULL, -- Height or position Y
    Z             DECIMAL(18, 2) NULL, -- Depth or position Z
    Planogram_ID  VARCHAR(20) NULL,    -- Planogram Code (F004, F026)
    PhotoUrl      NVARCHAR(500) NULL,  -- Optional link to the uploaded photo
    CONSTRAINT PK_PlanogramLayout PRIMARY KEY (Internal_ID, Sifra_Art)
);
GO

CREATE INDEX IX_PlanogramLayout_Internal ON dbo.PlanogramLayout (Internal_ID);
GO
